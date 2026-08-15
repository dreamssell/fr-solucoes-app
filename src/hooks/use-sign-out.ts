import { useNavigate } from "@tanstack/react-router";
import { signOutLocal } from "@/auth/client";

export function useSignOut() {
  const navigate = useNavigate();
  return async () => {
    await signOutLocal();
    navigate({ to: "/", replace: true });
  };
}
