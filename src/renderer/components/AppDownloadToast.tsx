import { Progress } from './ui/Progress';

interface AppDownloadToastProps {
  title: string;
  progress: number;
  message: string;
}

export default function AppDownloadToast({ title, progress, message }: AppDownloadToastProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className="download-toast fixed bottom-5 right-5 z-[10000] min-w-[280px] rounded-lg border p-4 text-white shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
      <div className="download-toast__header mb-2 flex justify-between font-bold">
        <span>{title}</span>
        <span className="text-accent">{clampedProgress}%</span>
      </div>
      <div className="download-toast__message mb-2 text-sm text-zinc-300">{message}</div>
      <Progress value={clampedProgress} className="mt-1" />
    </div>
  );
}
