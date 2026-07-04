import { Disc3 } from 'lucide-react';
import { useState } from 'react';

type RecordStorePhotoProps = {
  photoUrl?: string;
  name: string;
  className?: string;
};

export function RecordStorePhoto({ photoUrl, name, className = '' }: RecordStorePhotoProps) {
  const [failed, setFailed] = useState(false);

  if (!photoUrl || failed) {
    return (
      <div className={`record-locator-photo record-locator-photo--fallback ${className}`.trim()} aria-hidden="true">
        <Disc3 className="h-8 w-8 text-[var(--accent)]" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <img
      src={photoUrl}
      alt={`${name} storefront`}
      className={`record-locator-photo ${className}`.trim()}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}