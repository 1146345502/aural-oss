import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 36,
          background: "#F8F7F5",
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
              background: "#BE5A3C",
            }}
          />
        ))}
      </div>
    ),
    { ...size }
  );
}
