import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type Instructor, type InsertInstructor, type InstructorWithDetails } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export function useInstructors() {
  return useQuery<InstructorWithDetails[]>({
    queryKey: ["/api/instructors"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/instructors");
      return res.json();
    },
  });
}

export function useInstructor(id: number) {
  return useQuery<InstructorWithDetails>({
    queryKey: [`/api/instructors/${id}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/instructors/${id}`);
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateInstructor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertInstructor) => {
      const res = await apiRequest("POST", "/api/instructors", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instructors"] });
    },
  });
}

export function useUpdateInstructor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<InsertInstructor>) => {
      const res = await apiRequest("PATCH", `/api/instructors/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instructors"] });
    },
  });
}

export function useDeleteInstructor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/instructors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instructors"] });
    },
  });
}
