import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getQueryFn } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Building2, Upload, Palette, Save, Loader2, ImageIcon, X } from "lucide-react";
import type { Organization } from "@shared/schema";

export default function OrgSettings() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: org, isLoading } = useQuery<Organization | null>({
    queryKey: ["/api/user/organization"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const [createName, setCreateName] = useState("");
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [lastOrgId, setLastOrgId] = useState<number | null>(null);

  if (org && org.id !== lastOrgId) {
    setEditName(org.name);
    setEditColor(org.primaryColor || "");
    setLastOrgId(org.id);
  }

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/organizations", { name });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/user/organization"], data);
      toast({ title: "Organization created" });
      setCreateName("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { name?: string; primaryColor?: string | null; logoUrl?: string | null }) => {
      const res = await apiRequest("PUT", `/api/organizations/${org!.id}`, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/user/organization"], data);
      toast({ title: "Organization updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const logoMutation = useMutation({
    mutationFn: async (base64Image: string) => {
      const res = await apiRequest("POST", `/api/organizations/${org!.id}/logo`, { image: base64Image });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/user/organization"], data);
      toast({ title: "Logo uploaded" });
    },
    onError: (error: Error) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    },
  });

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Logo must be under 2MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      logoMutation.mutate(reader.result as string);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSaveDetails = () => {
    const updates: { name?: string; primaryColor?: string | null } = {};
    if (editName.trim() && editName.trim() !== org?.name) {
      updates.name = editName.trim();
    }
    const colorVal = editColor.trim() || null;
    if (colorVal !== (org?.primaryColor || null)) {
      updates.primaryColor = colorVal;
    }
    if (Object.keys(updates).length > 0) {
      updateMutation.mutate(updates);
    }
  };

  const removeLogo = () => {
    updateMutation.mutate({ logoUrl: null });
  };

  const planLabels: Record<string, string> = {
    free: "Free",
    individual: "Individual",
    enterprise: "Enterprise",
  };

  const planColors: Record<string, string> = {
    free: "bg-slate-100 text-slate-700",
    individual: "bg-blue-100 text-blue-700",
    enterprise: "bg-purple-100 text-purple-700",
  };

  return (
    <Layout>
      <div className="space-y-2">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-slate-900" data-testid="text-page-title">
          Organization Settings
        </h1>
        <p className="text-slate-500">Manage your organization's branding and details</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !org ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Create Organization
            </CardTitle>
            <CardDescription>
              Set up your company to customize branding across CampusAlly
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 max-w-md">
              <Input
                data-testid="input-org-name"
                placeholder="Organization name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && createName.trim()) createMutation.mutate(createName.trim());
                }}
              />
              <Button
                data-testid="button-create-org"
                onClick={() => createMutation.mutate(createName.trim())}
                disabled={!createName.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization Name</Label>
                <Input
                  id="org-name"
                  data-testid="input-edit-org-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand-color">Brand Color</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="brand-color"
                    data-testid="input-brand-color"
                    placeholder="#6366f1"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="flex-1"
                  />
                  {editColor && /^#[0-9a-fA-F]{6}$/.test(editColor) && (
                    <div
                      className="w-10 h-10 rounded-lg border border-slate-200 shrink-0"
                      style={{ backgroundColor: editColor }}
                      data-testid="swatch-brand-color"
                    />
                  )}
                </div>
                <p className="text-xs text-slate-400">Hex color code (e.g. #6366f1)</p>
              </div>
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">Plan:</span>
                  <Badge className={planColors[org.plan || "free"]} data-testid="badge-plan">
                    {planLabels[org.plan || "free"] || org.plan}
                  </Badge>
                </div>
                <Button
                  data-testid="button-save-details"
                  onClick={handleSaveDetails}
                  disabled={updateMutation.isPending}
                  size="sm"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                Logo
              </CardTitle>
              <CardDescription>Your logo appears in the sidebar, replacing default branding</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {org.logoUrl ? (
                <div className="relative inline-block">
                  <div className="w-40 h-40 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center p-4">
                    <img
                      src={org.logoUrl}
                      alt={org.name}
                      className="max-w-full max-h-full object-contain"
                      data-testid="img-org-logo"
                    />
                  </div>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                    onClick={removeLogo}
                    data-testid="button-remove-logo"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="w-40 h-40 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-400">
                  <ImageIcon className="w-8 h-8 mb-2" />
                  <span className="text-xs">No logo</span>
                </div>
              )}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={handleLogoSelect}
                  data-testid="input-logo-file"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={logoMutation.isPending}
                  data-testid="button-upload-logo"
                >
                  {logoMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {org.logoUrl ? "Replace Logo" : "Upload Logo"}
                </Button>
                <p className="text-xs text-slate-400 mt-2">PNG, JPG, SVG, or WebP. Max 2MB.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </Layout>
  );
}
