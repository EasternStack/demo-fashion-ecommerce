type Props = { features: string[]; material: string | null; careInstructions: string | null };

export function DetailCare({ features, material, careInstructions }: Props) {
  if (features.length === 0 && !material && !careInstructions) return null;
  return (
    <section className="reveal-scroll grid gap-8 md:grid-cols-2">
      {features.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest">Fitur</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm leading-relaxed">
            {features.map((f) => (
              <li key={f} className="flex gap-2">
                <span aria-hidden>—</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(material || careInstructions) && (
        <table className="w-full self-start text-sm">
          <caption className="sr-only">Detail dan perawatan produk</caption>
          <tbody>
            {material && (
              <tr className="border-b border-olive/15">
                <th scope="row" className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-widest opacity-70">
                  Material
                </th>
                <td className="py-2">{material}</td>
              </tr>
            )}
            {careInstructions && (
              <tr className="border-b border-olive/15">
                <th scope="row" className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-widest opacity-70">
                  Perawatan
                </th>
                <td className="py-2">{careInstructions}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
