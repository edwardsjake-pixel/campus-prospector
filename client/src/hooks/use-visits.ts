import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type Visit, type InsertVisit, type VisitWithInteractions, type InsertVisitInteraction } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export function useVisits() {
  return useQuery<VisitWithInteractions[]>({
    queryKey: ["/api/visits"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/visits");
      return res.json();
    },
  });
}

export function useCreateVisit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertVisit) => {
      const res = await apiRequest("POST", "/api/visits", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/visits"] });
    },
  });
}

export function useCreateInteraction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertVisitInteraction) => {
      const res = await apiRequest("POST", "/api/visit-interactions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/visits"] });
    },
  });
}

export function useDeleteVisit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/visits/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/visits"] });
    },
  });
}
