import { beforeEach, describe, expect, it } from "vitest";
import { addToCart, getCartView, setCartQty, removeCartItem } from "@/server/domain/cart";
import { cleanDb, makeCategory, makeProduct, makeUser } from "../helpers/db-factories";

beforeEach(cleanDb);

describe("cart", () => {
  it("menambah item baru dan menggabungkan qty untuk varian sama", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { stock: 10 });
    const variant = product.variants[0];
    await addToCart(user.id, variant.id, 2);
    await addToCart(user.id, variant.id, 3);
    const view = await getCartView(user.id);
    expect(view.items).toHaveLength(1);
    expect(view.items[0].qty).toBe(5);
    expect(view.subtotal).toBe(view.items[0].unitPrice * 5);
  });

  it("menolak menambah melebihi stok", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { stock: 2 });
    const result = await addToCart(user.id, product.variants[0].id, 5);
    expect(result).toEqual({ error: "Stok tidak mencukupi." });
  });

  it("menolak varian dari produk nonaktif", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { isActive: false });
    const result = await addToCart(user.id, product.variants[0].id, 1);
    expect(result).toEqual({ error: "Produk tidak tersedia." });
  });

  it("setCartQty 0 menghapus item", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, { stock: 10 });
    await addToCart(user.id, product.variants[0].id, 2);
    await setCartQty(user.id, product.variants[0].id, 0);
    const view = await getCartView(user.id);
    expect(view.items).toHaveLength(0);
  });

  it("removeCartItem menghapus baris", async () => {
    const user = await makeUser();
    const cat = await makeCategory();
    const product = await makeProduct(cat.id, {});
    await addToCart(user.id, product.variants[0].id, 1);
    await removeCartItem(user.id, product.variants[0].id);
    expect((await getCartView(user.id)).items).toHaveLength(0);
  });
});
