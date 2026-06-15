"use client";

type PortalFullScreenLoaderProps = {
  message?: string;
  subMessage?: string;
};

export function PortalFullScreenLoader({
  message = "Loading…",
  subMessage,
}: PortalFullScreenLoaderProps) {
  return (
    <div
      className="portal-fs-loader"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={message}
    >
      <div className="portal-fs-loader__backdrop" aria-hidden />

      <div className="portal-fs-loader__panel">
        <div className="portal-fs-loader__rings" aria-hidden>
          <span className="portal-fs-loader__ring portal-fs-loader__ring--outer" />
          <span className="portal-fs-loader__ring portal-fs-loader__ring--middle" />
          <span className="portal-fs-loader__ring portal-fs-loader__ring--inner" />
          <span className="portal-fs-loader__core" />
        </div>

        <p className="portal-fs-loader__message">{message}</p>
        {subMessage ? (
          <p className="portal-fs-loader__sub">{subMessage}</p>
        ) : (
          <p className="portal-fs-loader__sub">Please wait a moment</p>
        )}
      </div>
    </div>
  );
}
