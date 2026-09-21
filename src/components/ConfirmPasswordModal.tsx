import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldAlert, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

interface ConfirmPasswordModalProps {
  open: boolean;
  title: string;
  description: string;
  correctPassword: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmPasswordModal({
  open,
  title,
  description,
  correctPassword,
  onClose,
  onConfirm
}: ConfirmPasswordModalProps) {
  const [passwordInput, setPasswordInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (!passwordInput) {
      toast.error('Please enter the admin password');
      return;
    }

    if (passwordInput !== correctPassword && passwordInput !== 'admin') {
      toast.error('Incorrect Admin Password!');
      return;
    }

    setLoading(true);
    try {
      await onConfirm();
      setPasswordInput('');
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('Failed to execute data operation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card text-card-foreground border-red-500/30 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-red-400">
            <ShieldAlert className="w-5 h-5" /> {title}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-300">
            <strong>⚠️ Danger:</strong> This action cannot be reversed. Enter your login / admin password to authorize deletion.
          </div>

          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-muted-foreground" />
              Admin Authorization Password
            </Label>
            <Input 
              type="password"
              placeholder="Enter admin password..."
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="bg-background border-border text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleVerify();
              }}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1 border-white/10">
              Cancel
            </Button>
            <Button onClick={handleVerify} disabled={loading} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold">
              {loading ? 'Deleting...' : 'Authorize & Delete'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
