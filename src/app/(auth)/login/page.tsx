import { redirect } from "next/navigation";

// Login has been consolidated into the root page (/).
export default function LoginPage() {
  redirect("/");
}
