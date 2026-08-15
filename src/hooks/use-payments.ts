import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPayments } from "@/lib/payments.functions";

export function usePayments() {
  const fetchPayments = useServerFn(getPayments);
  return useQuery({
    queryKey: ["payments"],
    queryFn: () => fetchPayments(),
  });
}
