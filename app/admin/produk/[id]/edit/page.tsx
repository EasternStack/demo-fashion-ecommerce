import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/product-form";
import { listCategories } from "@/server/domain/catalog";
import { getProductForEdit } from "@/server/domain/admin-catalog";
import { requireAdmin } from "@/server/session";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAdmin();
  const [product, categories] = await Promise.all([getProductForEdit(id, session), listCategories()]);
  if (!product || "error" in product) notFound();
  return (
    <div>
      <h1 className="text-2xl font-extrabold uppercase tracking-tight">Edit: {product.name}</h1>
      <div className="mt-6">
        <ProductForm initial={product} categories={categories} />
      </div>
    </div>
  );
}
