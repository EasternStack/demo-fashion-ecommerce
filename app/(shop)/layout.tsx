import { Footer } from "@/components/storefront/footer";
import { Header } from "@/components/storefront/header";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <Footer />
    </>
  );
}
