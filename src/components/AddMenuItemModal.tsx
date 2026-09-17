import { MenuItemModal } from './MenuItemModal';

interface AddMenuItemModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: () => void;
}

export function AddMenuItemModal({ open, onClose, onAdd }: AddMenuItemModalProps) {
  return (
    <MenuItemModal
      open={open}
      item={null}
      onClose={onClose}
      onSaveSuccess={onAdd}
    />
  );
}
