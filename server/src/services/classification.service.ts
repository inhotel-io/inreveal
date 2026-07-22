import { Injectable } from '@nestjs/common';
import { type ClassificationFaceExclusion, type SystemConfig } from 'src/config';
import { OnEvent, OnJob } from 'src/decorators';
import { AssetVisibility, ImmichWorker, JobName, JobStatus, QueueName, SystemMetadataKey } from 'src/enum';
import { type ClassificationFaceSummary } from 'src/repositories/classification.repository';
import { ArgOf } from 'src/repositories/event.repository';
import { BaseService } from 'src/services/base.service';
import { JobOf } from 'src/types';
import { isFacialRecognitionEnabled } from 'src/utils/misc';
import { upsertTags } from 'src/utils/tag';

type ClassificationConfig = SystemConfig['classification'];

/** Face-exclusion rule → the face-summary flag that disqualifies an asset. `off` (or absent) is not listed. */
const FACE_EXCLUSION_FLAGS: Partial<Record<ClassificationFaceExclusion, keyof ClassificationFaceSummary>> = {
  any_assigned_face: 'hasAssignedFace',
  named_people: 'hasNamedPerson',
  named_visible_people: 'hasNamedVisiblePerson',
};

const getFaceExclusionFlag = (category: ClassificationConfig['categories'][number]) =>
  category.faceExclusion ? FACE_EXCLUSION_FLAGS[category.faceExclusion] : undefined;

@Injectable()
export class ClassificationService extends BaseService {
  // Caching the promise (not the resolved value) also deduplicates concurrent encodes of the same
  // prompt; failures evict the entry so the next caller retries.
  private embeddingCache = new Map<string, Promise<number[]>>();

  private getOrEncodePrompt(prompt: string, modelName: string): Promise<number[]> {
    const key = `${modelName}::${prompt}`;

    let embedding = this.embeddingCache.get(key);
    if (!embedding) {
      embedding = this.machineLearningRepository
        .encodeText(prompt, { modelName })
        .then((raw) => this.parseEmbedding(raw));
      embedding.catch(() => this.embeddingCache.delete(key));
      this.embeddingCache.set(key, embedding);
    }

    return embedding;
  }

  @OnEvent({ name: 'ConfigInit', workers: [ImmichWorker.Microservices] })
  async onConfigInit({ newConfig }: ArgOf<'ConfigInit'>) {
    const snapshot = await this.systemMetadataRepository.get(SystemMetadataKey.ClassificationConfigState);

    if (snapshot) {
      await this.reconcileAutoTags(snapshot, newConfig.classification);
    }

    await this.systemMetadataRepository.set(SystemMetadataKey.ClassificationConfigState, newConfig.classification);
  }

  @OnEvent({ name: 'ConfigUpdate', workers: [ImmichWorker.Microservices], server: true })
  async onConfigUpdate({ oldConfig, newConfig }: ArgOf<'ConfigUpdate'>) {
    const clipChanged = oldConfig.machineLearning.clip.modelName !== newConfig.machineLearning.clip.modelName;
    const classificationChanged = JSON.stringify(oldConfig.classification) !== JSON.stringify(newConfig.classification);

    if (!clipChanged && !classificationChanged) {
      return;
    }

    this.embeddingCache.clear();

    if (classificationChanged) {
      await this.reconcileAutoTags(oldConfig.classification, newConfig.classification);
      await this.systemMetadataRepository.set(SystemMetadataKey.ClassificationConfigState, newConfig.classification);
    }
  }

  private async reconcileAutoTags(previous: ClassificationConfig, current: ClassificationConfig) {
    const currentByName = new Map(current.categories.map((c) => [c.name, c]));

    for (const previousCategory of previous.categories) {
      const currentCategory = currentByName.get(previousCategory.name);

      if (!currentCategory) {
        this.logger.log(`Classification category "${previousCategory.name}" removed; clearing auto-tag assignments`);
        await this.classificationRepository.removeAutoTagAssignments(previousCategory.name);
        continue;
      }

      if (currentCategory.similarity > previousCategory.similarity) {
        this.logger.log(
          `Classification category "${previousCategory.name}" similarity increased ` +
            `(${previousCategory.similarity} → ${currentCategory.similarity}); clearing auto-tag assignments`,
        );
        await this.classificationRepository.removeAutoTagAssignments(previousCategory.name);
      }
    }
  }

  @OnJob({ name: JobName.AssetClassifyQueueAll, queue: QueueName.Classification })
  async handleClassifyQueueAll({ force }: JobOf<JobName.AssetClassifyQueueAll>): Promise<JobStatus> {
    const { classification } = await this.getConfig({ withCache: true });

    if (!classification.enabled) {
      return JobStatus.Skipped;
    }

    if (force) {
      await this.classificationRepository.resetClassifiedAt();
    }

    const stream = this.classificationRepository.streamUnclassifiedAssets();

    let queue: Array<{ name: JobName.AssetClassify; data: { id: string } }> = [];
    for await (const asset of stream) {
      queue.push({ name: JobName.AssetClassify, data: { id: asset.id } });
      if (queue.length >= 1000) {
        await this.jobRepository.queueAll(queue);
        queue = [];
      }
    }

    await this.jobRepository.queueAll(queue);
    return JobStatus.Success;
  }

  @OnJob({ name: JobName.AssetClassify, queue: QueueName.Classification })
  async handleClassify({ id }: { id: string }): Promise<JobStatus> {
    const asset = await this.assetRepository.getById(id);
    if (!asset) {
      return JobStatus.Failed;
    }

    const { classification, machineLearning } = await this.getConfig({ withCache: true });

    if (!classification.enabled) {
      return JobStatus.Skipped;
    }

    const embedding = await this.searchRepository.getEmbedding(id);
    if (!embedding) {
      return JobStatus.Skipped;
    }

    const enabledCategories = classification.categories.filter((c) => c.enabled);
    if (enabledCategories.length === 0) {
      await this.classificationRepository.setClassifiedAt(id);
      return JobStatus.Skipped;
    }

    const eligibleCategories = await this.getEligibleCategories(enabledCategories, machineLearning, id);
    if (eligibleCategories.length === 0) {
      await this.classificationRepository.setClassifiedAt(id);
      return JobStatus.Skipped;
    }

    const assetEmbedding = this.parseEmbedding(embedding);
    let shouldArchive = false;

    for (const category of eligibleCategories) {
      let bestSimilarity = -1;
      for (const prompt of category.prompts) {
        const promptEmbedding = await this.getOrEncodePrompt(prompt, machineLearning.clip.modelName);
        const similarity = this.cosineSimilarity(assetEmbedding, promptEmbedding);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
        }
      }

      if (bestSimilarity >= category.similarity) {
        const tags = await upsertTags(this.tagRepository, {
          userId: asset.ownerId,
          tags: [`Auto/${category.name}`],
        });
        const tagId = tags[0].id;
        await this.tagRepository.upsertAssetIds([{ tagId, assetId: id }]);

        if (category.action === 'tag_and_archive') {
          shouldArchive = true;
        }
      }
    }

    if (shouldArchive && asset.visibility === AssetVisibility.Timeline) {
      await this.assetRepository.updateAll([id], { visibility: AssetVisibility.Archive });
    }

    await this.classificationRepository.setClassifiedAt(id);
    return JobStatus.Success;
  }

  private async getEligibleCategories(
    categories: ClassificationConfig['categories'],
    machineLearning: SystemConfig['machineLearning'],
    assetId: string,
  ) {
    if (!categories.some((category) => getFaceExclusionFlag(category))) {
      return categories;
    }

    if (!isFacialRecognitionEnabled(machineLearning)) {
      return categories.filter((category) => !getFaceExclusionFlag(category));
    }

    await this.jobRepository.waitForQueueCompletion(QueueName.FaceDetection, QueueName.FacialRecognition);
    const faceSummary = await this.classificationRepository.getFaceSummary(assetId);

    return categories.filter((category) => {
      const flag = getFaceExclusionFlag(category);
      return !flag || !faceSummary[flag];
    });
  }

  /** pgvector renders a vector as `[1,2,3]`, which is already valid JSON. */
  private parseEmbedding(raw: string): number[] {
    return JSON.parse(raw) as number[];
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
