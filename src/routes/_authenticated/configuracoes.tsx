"use client";

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { User, Key, Mail, Upload, Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import { AppShell, PageHeader } from "@/components/fr/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações da Conta — FR Financeiro" },
      {
        name: "description",
        content: "Gerencie suas informações de perfil, foto e segurança da conta.",
      },
    ],
  }),
  component: Configuracoes,
});

function Configuracoes() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [senhaNova, setSenhaNova] = useState("");
  const [senhaConfirmacao, setSenhaConfirmacao] = useState("");

  useEffect(() => {
    carregarUsuario();
  }, []);

  async function carregarUsuario() {
    try {
      const { data: { user: currentUser }, error } = await supabase.auth.getUser();
      if (error || !currentUser) {
        toast.error("Não foi possível carregar as informações do usuário.");
        return;
      }
      setUser(currentUser);
      setNome(currentUser.user_metadata?.["full_name"] || "");
      setEmail(currentUser.email || "");

      const pathOrUrl = currentUser.user_metadata?.["avatar_url"];
      if (pathOrUrl) {
        if (pathOrUrl.startsWith("http")) {
          setAvatarUrl(pathOrUrl);
        } else {
          // Gerar URL assinada para imagens privadas no bucket "documents"
          const { data, error: signedError } = await supabase.storage
            .from("documents")
            .createSignedUrl(pathOrUrl, 31536000); // 1 ano de validade
          if (!signedError && data) {
            setAvatarUrl(data.signedUrl);
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error("O nome não pode estar em branco.");
      return;
    }
    setSavingName(true);
    try {
      // 1. Atualizar metadata da conta auth
      const { data, error } = await supabase.auth.updateUser({
        data: { full_name: nome.trim() }
      });
      if (error) throw error;

      // 2. Sincronizar nome com a tabela public.employees caso haja correspondência por e-mail
      if (user?.email) {
        const { data: empRecord } = await supabase
          .from("employees")
          .select("id")
          .eq("access_email", user.email)
          .maybeSingle();

        if (empRecord) {
          const { error: empError } = await supabase
            .from("employees")
            .update({ full_name: nome.trim() })
            .eq("id", empRecord.id);
          
          if (empError) {
            console.error("Erro ao sincronizar nome com tabela de funcionários:", empError);
          }
        }
      }

      toast.success("Nome atualizado com sucesso!");
      setUser(data.user);
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar dados.");
    } finally {
      setSavingName(false);
    }
  }

  async function handleUpdateEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || email.trim() === user?.email) {
      toast.error("Insira um endereço de e-mail diferente do atual.");
      return;
    }
    setSavingEmail(true);
    try {
      const { data, error } = await supabase.auth.updateUser({
        email: email.trim()
      });
      if (error) throw error;
      toast.success("Solicitação de alteração enviada! Confirme no novo e-mail.");
      setUser(data.user);
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar e-mail.");
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!senhaNova || !senhaConfirmacao) {
      toast.error("Preencha a nova senha e a confirmação.");
      return;
    }
    if (senhaNova.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (senhaNova !== senhaConfirmacao) {
      toast.error("As senhas informadas não coincidem.");
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: senhaNova
      });
      if (error) throw error;
      toast.success("Senha atualizada com sucesso!");
      setSenhaNova("");
      setSenhaConfirmacao("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar senha.");
    } finally {
      setSavingPassword(false);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validar tipo de imagem
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      toast.error("Selecione uma imagem válida (JPEG, PNG ou WEBP).");
      return;
    }

    setUploadingPhoto(true);
    try {
      const extension = file.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${extension}`;
      const filePath = `avatars/${user.id}/${fileName}`;

      // 1. Fazer upload para o bucket private "documents"
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // 2. Atualizar metadata da conta auth
      const { data: updatedUserData, error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: filePath }
      });

      if (updateError) throw updateError;

      // 3. Gerar URL assinada imediata para visualização
      const { data: signedData, error: signedError } = await supabase.storage
        .from("documents")
        .createSignedUrl(filePath, 31536000);

      if (signedError) throw signedError;

      setAvatarUrl(signedData.signedUrl);
      setUser(updatedUserData.user);
      toast.success("Foto do perfil atualizada com sucesso!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao enviar foto.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
        </div>
      </AppShell>
    );
  }

  const userInitials = nome
    ? nome.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase()
    : email.slice(0, 2).toUpperCase();

  return (
    <AppShell>
      <PageHeader
        title="Configurações da Conta"
        description="Atualize suas informações pessoais, gerencie sua foto de perfil e a segurança da conta."
      />

      <div className="grid gap-6 md:grid-cols-3">
        {/* Lado Esquerdo: Foto de Perfil */}
        <Card className="border-border bg-card shadow-lg md:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg text-gold font-bold">Foto do Perfil</CardTitle>
            <CardDescription>Esta foto é exibida no painel administrativo.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center pb-6">
            <div className="relative group">
              <div className="h-28 w-28 overflow-hidden rounded-full border-2 border-gold/40 bg-surface flex items-center justify-center text-3xl font-display font-bold text-gold shadow-md">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Foto do Perfil" className="h-full w-full object-cover" />
                ) : (
                  userInitials
                )}
              </div>
              <label
                htmlFor="photo-file"
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white text-xs font-semibold"
              >
                {uploadingPhoto ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <Upload className="h-4 w-4 text-gold" />
                    <span>Alterar Foto</span>
                  </div>
                )}
              </label>
              <input
                id="photo-file"
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handlePhotoUpload}
                disabled={uploadingPhoto}
              />
            </div>
            <p className="mt-4 text-[10px] text-center text-muted-foreground leading-normal max-w-[200px]">
              Suporta formatos PNG, JPG ou WEBP. A imagem será armazenada com segurança.
            </p>
          </CardContent>
        </Card>

        {/* Lado Direito: Informações e Senha */}
        <div className="space-y-6 md:col-span-2">
          {/* Card: Dados Gerais */}
          <Card className="border-border bg-card shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg text-gold font-bold">Dados Gerais</CardTitle>
              <CardDescription>Nome de exibição e credenciais da conta.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Form Nome */}
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="perf_nome">Nome Completo</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="perf_nome"
                      placeholder="Seu nome completo"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className="pl-9"
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    className="bg-gold text-black hover:bg-gold/90 font-bold"
                    disabled={savingName}
                  >
                    {savingName ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                    Salvar Alterações de Nome
                  </Button>
                </div>
              </form>

              <hr className="border-border" />

              {/* Form E-mail */}
              <form onSubmit={handleUpdateEmail} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="perf_email">E-mail da Conta</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="perf_email"
                      type="email"
                      placeholder="seu.email@exemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9"
                      required
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-normal flex items-start gap-1 text-gold/80">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    Atenção: A alteração de e-mail enviará um link de confirmação para o novo endereço.
                  </p>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="outline"
                    className="border-gold/40 text-gold hover:bg-gold/10 hover:text-gold"
                    disabled={savingEmail}
                  >
                    {savingEmail ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                    Alterar Endereço de E-mail
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Card: Trocar Senha */}
          <Card className="border-border bg-card shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg text-gold font-bold">Segurança da Conta</CardTitle>
              <CardDescription>Mantenha sua senha forte e atualizada.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="pass_nova">Nova Senha</Label>
                    <div className="relative">
                      <Key className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="pass_nova"
                        type="password"
                        placeholder="Mínimo 6 caracteres"
                        value={senhaNova}
                        onChange={(e) => setSenhaNova(e.target.value)}
                        className="pl-9"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pass_confirm">Confirmar Nova Senha</Label>
                    <div className="relative">
                      <Key className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="pass_confirm"
                        type="password"
                        placeholder="Repita a nova senha"
                        value={senhaConfirmacao}
                        onChange={(e) => setSenhaConfirmacao(e.target.value)}
                        className="pl-9"
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    className="bg-gold text-black hover:bg-gold/90 font-bold"
                    disabled={savingPassword}
                  >
                    {savingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                    Atualizar Senha
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
