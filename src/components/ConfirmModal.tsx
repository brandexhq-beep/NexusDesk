import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
}

export function ConfirmModal({ open, onClose, onConfirm, title, description, confirmText = 'Confirm', cancelText = 'Cancel' }: ConfirmModalProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="bg-black/90 border-white/10 text-white sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-muted-foreground pt-2">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-6 flex gap-2 sm:justify-end">
          <Button variant="outline" className="border-white/10 hover:bg-white/5" onClick={onClose}>
            {cancelText}
          </Button>
          <Button variant="destructive" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { onConfirm(); onClose(); }}>
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
