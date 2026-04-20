import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { LogIn, UserPlus, Search } from "lucide-react";

interface LoginPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginPromptModal({
  isOpen,
  onClose,
}: LoginPromptModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-[#0F0F11] border border-[rgba(58,42,238,0.3)]">
        <DialogHeader className="text-center sm:text-center pb-2">
          <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-[rgba(58,42,238,0.1)] border border-[rgba(58,42,238,0.3)] flex items-center justify-center">
            <Search className="w-6 h-6 text-[#3A2AEE]" />
          </div>
          <DialogTitle className="text-white text-xl font-semibold">
            Sign In Required
          </DialogTitle>
          <DialogDescription className="text-white/50 text-sm">
            You need to be signed in and have credits to search.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="space-y-3">
            <Button
              asChild
              className="w-full h-11 bg-[#3A2AEE] hover:bg-[#4B3BF5] text-white border-0"
            >
              <Link to="/login" onClick={onClose}>
                <LogIn className="w-4 h-4 mr-2" />
                Sign In
              </Link>
            </Button>

            <Button
              asChild
              variant="outline"
              className="w-full h-11 border-[rgba(58,42,238,0.5)] text-white hover:bg-[rgba(58,42,238,0.1)] hover:text-white bg-transparent"
            >
              <Link to="/signup" onClick={onClose}>
                <UserPlus className="w-4 h-4 mr-2" />
                Create Account
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
