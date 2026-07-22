<script lang="ts">
  import { getSpaceAccent, type SpaceColor } from '$lib/utils/space-colors';
  import { t } from 'svelte-i18n';

  interface Props {
    role: string;
    spaceColor?: SpaceColor;
    size?: 'sm' | 'md';
  }

  let { role, spaceColor = 'primary', size = 'md' }: Props = $props();

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-0.5 text-xs',
  };

  let accent = $derived(getSpaceAccent(spaceColor));
  let badgeClass = $derived.by(() => {
    if (role === 'owner') {
      return `${accent.bg} text-white ${sizeClasses[size]}`;
    }
    if (role === 'editor') {
      return `border ${accent.border} ${accent.text} ${sizeClasses[size]}`;
    }
    return `bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 ${sizeClasses[size]}`;
  });

  const roleLabel = $derived(
    role === 'owner' ? $t('owner') : role === 'editor' ? $t('role_editor') : $t('role_viewer'),
  );
</script>

<span class="inline-flex items-center rounded-full font-medium capitalize {badgeClass}" data-testid="role-badge-{role}">
  {roleLabel}
</span>
