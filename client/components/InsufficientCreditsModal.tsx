import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { CreditCard, Ticket, AlertTriangle } from "lucide-react";

interface InsufficientCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
}

export function InsufficientCreditsModal({
  isOpen,
  onClose,
  currentBalance,
}: InsufficientCreditsModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-[#0F0F11] border border-[rgba(58,42,238,0.3)]">
        <DialogHeader className="text-center sm:text-center pb-2">
          <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-[rgba(234,179,8,0.1)] border border-[rgba(234,179,8,0.3)] flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-[#EAB308]" />
          </div>
          <DialogTitle className="text-white text-xl font-semibold">
            Out of Credits
          </DialogTitle>
          <DialogDescription className="text-white/50 text-sm">
            You need credits to perform searches. Each search costs 1 credit.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="bg-[rgba(17,16,24,0.8)] rounded-lg p-4 border border-white/5 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-white/50 text-sm">Current balance</span>
              <span className="text-white font-semibold text-lg">{currentBalance}</span>
            </div>
          </div>

          <div className="space-y-3">
            <Button
              asChild
              className="w-full h-11 bg-[#3A2AEE] hover:bg-[#4B3BF5] text-white border-0"
            >
              <Link to="/credits" onClick={onClose}>
                <CreditCard className="w-4 h-4 mr-2" />
                Purchase Credits
              </Link>
            </Button>

            <Button
              asChild
              variant="outline"
              className="w-full h-11 border-[rgba(58,42,238,0.5)] text-white hover:bg-[rgba(58,42,238,0.1)] hover:text-white bg-transparent"
            >
              <Link to="/pricing" onClick={onClose}>
                <Ticket className="w-4 h-4 mr-2" />
                View Pricing Plans
              </Link>
            </Button>

            <Button
              variant="ghost"
              className="w-full text-white/50 hover:text-white hover:bg-transparent"
              onClick={onClose}
            >
              Continue Browsing
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
