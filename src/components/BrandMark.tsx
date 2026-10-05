// The Outbreak Files mark, inline so it scales with the text beside it. The
// geometry and colours are brand/mark.svg (the light-page pair: the site is
// light only); tests/brand.test.ts fails if they drift apart. Fills are
// attributes rather than classes so the same element also renders inside the
// share cards (next/og), which do not read Tailwind.
export function BrandMark({ size = "1em", ...props }: Omit<React.ComponentProps<"svg">, "viewBox"> & { size?: string | number }) {
  return (
    <svg
      viewBox="6 10 52 48"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path fill="#1c2433" d="M6 10H26L32 17H58V58H6Z" />
      <circle fill="#e0533a" cx="26" cy="40" r="9" />
      <circle fill="#e0533a" cx="44" cy="33" r="4.5" />
      <circle fill="#e0533a" cx="46" cy="48" r="3" />
    </svg>
  );
}
