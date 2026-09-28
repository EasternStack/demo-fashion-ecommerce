import { ProductForm } from "@/components/admin/product-form";
import { listCategories } from "@/server/domain/catalog";

export default async function NewProductPage() {
  const categories = await listCategories();
  return (
    <div>
      <h1 className="text-2xl font-extrabold uppercase tracking-tight">Produk Baru</h1>
      <div className="mt-6">
        <ProductForm categories={categories} />
      </div>
    </div>
  );
}
