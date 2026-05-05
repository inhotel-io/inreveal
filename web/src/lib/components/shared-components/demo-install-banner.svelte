<script lang="ts">
  import { browser } from '$app/environment';

  interface Props {
    visible: boolean;
  }

  let { visible }: Props = $props();

  const INSTALL_URL =
    'https://opennoodle.de/install?utm_source=demo.opennoodle.de&utm_medium=banner&utm_campaign=demo_to_install&utm_content=install_banner';

  $effect(() => {
    if (!browser) {
      return;
    }

    if (visible) {
      document.documentElement.dataset.demoInstallBanner = 'true';
    } else {
      delete document.documentElement.dataset.demoInstallBanner;
    }

    return () => {
      delete document.documentElement.dataset.demoInstallBanner;
    };
  });
</script>

{#if visible}
  <div
    role="region"
    aria-label="Demo install prompt"
    data-testid="demo-install-banner"
    class="demo-install-banner fixed inset-x-0 top-0 z-50 overflow-hidden border-b border-[#203025] text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
  >
    <div class="mx-auto flex h-full max-w-7xl items-center justify-between gap-2 px-3 sm:gap-3 sm:px-6">
      <div class="flex min-w-0 items-center gap-2 sm:gap-3">
        <span
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#52df91]/40 bg-[#52df91]/10"
        >
          <span class="h-2 w-2 rounded-full bg-[#52df91] shadow-[0_0_18px_rgba(82,223,145,0.9)]"></span>
        </span>
        <div class="min-w-0 leading-tight">
          <p class="truncate text-[13px] font-semibold tracking-[0.01em] sm:hidden">Public demo</p>
          <p class="hidden truncate text-sm font-semibold tracking-[0.01em] sm:block">
            Public demo
            <span class="font-normal text-white/55">/</span>
            <span class="text-white/85">make it yours</span>
          </p>
          <p class="hidden truncate text-[11px] text-white/58 sm:block">
            Bring this experience home to your own server and photo library.
          </p>
        </div>
      </div>

      <a
        href={INSTALL_URL}
        rel="noreferrer"
        data-umami-event="cta-install-demo-banner"
        data-umami-event-location="demo-install-banner"
        class="group inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-[#f7f1df]/70 bg-[#f7f1df] px-3 text-sm font-semibold text-[#101611] shadow-[0_1px_0_rgba(255,255,255,0.45)_inset,0_10px_22px_rgba(0,0,0,0.28)] transition hover:-translate-y-px hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#52df91] sm:px-4"
      >
        <span>Install your own</span>
        <span class="transition-transform group-hover:translate-x-0.5">&rarr;</span>
      </a>
    </div>
  </div>
{/if}

<style>
  .demo-install-banner {
    height: var(--demo-install-banner-height);
    background:
      linear-gradient(90deg, rgba(82, 223, 145, 0.16), transparent 34%, rgba(246, 216, 132, 0.12)),
      repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 9px), #08110c;
  }
</style>
