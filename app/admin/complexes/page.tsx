import { redirect } from "next/navigation";

export default function ComplexesPage() {
  redirect("/admin/data?source=lh-complexes");
}
