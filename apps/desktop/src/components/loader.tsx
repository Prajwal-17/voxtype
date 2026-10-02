import { CircleNotchIcon } from './icons';
export function Loader({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex min-h-24 items-center justify-center gap-2 text-ui text-muted"
    >
      <CircleNotchIcon
        size={18}
        className="animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      {label}
    </div>
  );
}
