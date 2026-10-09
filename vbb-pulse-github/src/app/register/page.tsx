import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Create account", description: "Create a VBB Pulse account to get smart Berlin-Potsdam transit delay alerts." };

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
