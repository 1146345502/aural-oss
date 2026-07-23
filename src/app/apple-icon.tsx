import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const ICON_URL = process.env.NEXT_PUBLIC_ICON_URL;
const BG_COLOR = process.env.NEXT_PUBLIC_ICON_BG_COLOR || "#F8F7F5";
const ACCENT_COLOR = process.env.NEXT_PUBLIC_ICON_ACCENT_COLOR || "#BE5A3C";

export default function AppleIcon() {
  if (ICON_URL) {
    return new ImageResponse(
      // eslint-disable-next-line @next/next/no-img-element
      <img src={ICON_URL} width={size.width} height={size.height} alt="" />,
      { ...size }
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 36,
          background: BG_COLOR,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
        }}
      >
        {[39, 98, 70, 84, 34].map((h, i) => (
          <div
            key={i}
            style={{
              width: 14,
              height: h,
              borderRadius: 7,
              background: ACCENT_COLOR,
            }}
          />
        ))}
      </div>
    ),
    { ...size }
  );
}
