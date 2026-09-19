import { SpeciesId, SpeciesProfile } from '../types/models';

export const formatDateTime = (value: string) =>
  !Number.isFinite(Date.parse(value))
    ? 'Time not reported'
    : new Intl.DateTimeFormat('en', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value));

export const formatTimeAgo = (value: string) => {
  if (!Number.isFinite(Date.parse(value))) {
    return 'Time not reported';
  }
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 60000),
  );
  if (minutes < 1) {
    return 'Just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }
  return `${Math.round(hours / 24)} days ago`;
};

export const findProfile = (
  profiles: SpeciesProfile[],
  speciesId: SpeciesId | 'none',
) => profiles.find(item => item.id === speciesId);
