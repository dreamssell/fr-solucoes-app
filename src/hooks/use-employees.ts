import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getEmployees } from "@/lib/employees.functions";

export function useEmployees() {
  const fetchEmployees = useServerFn(getEmployees);
  return useQuery({
    queryKey: ["employees"],
    queryFn: () => fetchEmployees(),
  });
}
