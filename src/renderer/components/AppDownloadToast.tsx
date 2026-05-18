import { Progress } from './ui/Progress';

interface AppDownloadToastProps {
  title: string;
  progress: number;
  message: string;
}

export default function AppDownloadToast({ title, progress, message }: AppDownloadToastProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className="download-toast">
      <div className="download-toast__header">
        <span>{title}</span>
        <span className="text-accent">{clampedProgress}%</span>
      </div>
      <div className="download-toast__message">{message}</div>
      <Progress value={clampedProgress} className="mt-1" />
    </div>
  );
}
