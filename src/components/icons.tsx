/* مجموعة أيقونات SVG مضمّنة (بلا أي اعتماديات خارجية) */
import type { ReactNode, SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children">;

function createIcon(displayName: string, defaultClassName: string, content: ReactNode) {
  function Icon({ className, ...rest }: IconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className={className ?? defaultClassName}
        {...rest}
      >
        {content}
      </svg>
    );
  }
  Icon.displayName = displayName;
  return Icon;
}

export const IconSparkles = createIcon("IconSparkles", "h-5 w-5", (
  <>
    <path d="M12 3.5 13.7 8.8 19 10.5l-5.3 1.7L12 17.5l-1.7-5.3L5 10.5l5.3-1.7L12 3.5z" />
    <path d="m18.6 15.4.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1z" />
  </>
));

export const IconKey = createIcon("IconKey", "h-5 w-5", (
  <>
    <circle cx="6.6" cy="12" r="3.1" />
    <path d="M9.7 12H21" />
    <path d="M17.2 12v3.4" />
    <path d="M13.6 12v2.4" />
  </>
));

export const IconPlus = createIcon("IconPlus", "h-5 w-5", (
  <>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </>
));

export const IconTrash = createIcon("IconTrash", "h-5 w-5", (
  <>
    <path d="M4 6.5h16" />
    <path d="M9.7 6.5V4.9c0-.8.6-1.4 1.4-1.4h1.8c.8 0 1.4.6 1.4 1.4v1.6" />
    <path d="m6.2 6.5.75 12.6A1.9 1.9 0 0 0 8.85 21h6.3a1.9 1.9 0 0 0 1.9-1.9l.75-12.6" />
    <path d="M10 10.5v6" />
    <path d="M14 10.5v6" />
  </>
));

export const IconPower = createIcon("IconPower", "h-5 w-5", (
  <>
    <path d="M12 3.2v8" />
    <path d="M17.3 6.9a7.6 7.6 0 1 1-10.6 0" />
  </>
));

export const IconClock = createIcon("IconClock", "h-5 w-5", (
  <>
    <circle cx="12" cy="12" r="8.3" />
    <path d="M12 7.5V12l3.2 1.9" />
  </>
));

export const IconRefresh = createIcon("IconRefresh", "h-5 w-5", (
  <>
    <path d="M20.3 12a8.3 8.3 0 1 1-8.3-8.3c2.3 0 4.4.9 6 2.4l2.3 2.2" />
    <path d="M20.3 3.5v4.8h-4.8" />
  </>
));

export const IconListChecks = createIcon("IconListChecks", "h-5 w-5", (
  <>
    <path d="M11.5 6h9" />
    <path d="M11.5 12h9" />
    <path d="M11.5 18h9" />
    <path d="m3.5 6 1.6 1.6L8 4.7" />
    <path d="m3.5 12 1.6 1.6L8 10.7" />
    <path d="m3.5 18 1.6 1.6L8 16.7" />
  </>
));

export const IconImage = createIcon("IconImage", "h-5 w-5", (
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.2" />
    <circle cx="9" cy="9.8" r="1.7" />
    <path d="m4.5 17.6 4.3-4.3a1.6 1.6 0 0 1 2.3 0l6.4 6.2" />
    <path d="m14.2 15.8 1.5-1.5a1.6 1.6 0 0 1 2.3 0l2.4 2.3" />
  </>
));

export const IconVideo = createIcon("IconVideo", "h-5 w-5", (
  <>
    <rect x="2.8" y="6" width="12.7" height="12" rx="2.4" />
    <path d="m15.5 10.4 5.7-3.1v9.4l-5.7-3.1" />
  </>
));

export const IconLayers = createIcon("IconLayers", "h-5 w-5", (
  <>
    <path d="m12 3.5 8.5 4.7L12 12.9 3.5 8.2 12 3.5z" />
    <path d="m3.5 13.4 8.5 4.7 8.5-4.7" />
  </>
));

export const IconExternal = createIcon("IconExternal", "h-5 w-5", (
  <>
    <path d="M14.5 4.5h5v5" />
    <path d="M19.5 4.5 11.5 12.5" />
    <path d="M19.5 13.5V18a1.8 1.8 0 0 1-1.8 1.8H6a1.8 1.8 0 0 1-1.8-1.8V6.3A1.8 1.8 0 0 1 6 4.5h4.5" />
  </>
));

export const IconCpu = createIcon("IconCpu", "h-5 w-5", (
  <>
    <rect x="5" y="5" width="14" height="14" rx="2" />
    <rect x="9.2" y="9.2" width="5.6" height="5.6" rx="1" />
    <path d="M9 2.5V5M15 2.5V5M9 19v2.5M15 19v2.5M2.5 9H5M2.5 15H5M19 9h2.5M19 15h2.5" />
  </>
));

export const IconAlert = createIcon("IconAlert", "h-5 w-5", (
  <>
    <path d="M10.3 4.3a1.95 1.95 0 0 1 3.4 0l7.1 12.3a1.95 1.95 0 0 1-1.7 2.9H4.9a1.95 1.95 0 0 1-1.7-2.9L10.3 4.3z" />
    <path d="M12 9.2v4.1" />
    <path d="M12 16.4h.01" />
  </>
));

export const IconCheck = createIcon("IconCheck", "h-5 w-5", (
  <path d="m4.5 12.6 5 5L19.5 6.6" />
));

export const IconCopy = createIcon("IconCopy", "h-5 w-5", (
  <>
    <rect x="8.7" y="8.7" width="11.8" height="11.8" rx="2.2" />
    <path d="M6 15.3h-.5A1.8 1.8 0 0 1 3.7 13.5V5.5A1.8 1.8 0 0 1 5.5 3.7h8a1.8 1.8 0 0 1 1.8 1.8v.5" />
  </>
));

export const IconX = createIcon("IconX", "h-5 w-5", (
  <>
    <path d="m6 6 12 12" />
    <path d="M18 6 6 18" />
  </>
));

export const IconSearch = createIcon("IconSearch", "h-5 w-5", (
  <>
    <circle cx="11" cy="11" r="6.3" />
    <path d="m15.8 15.8 4.4 4.4" />
  </>
));

export const IconArchive = createIcon("IconArchive", "h-5 w-5", (
  <>
    <rect x="3" y="3.8" width="18" height="4.4" rx="1.2" />
    <path d="M5 8.2V18a2.3 2.3 0 0 0 2.3 2.3h9.4A2.3 2.3 0 0 0 19 18V8.2" />
    <path d="M9.8 12.5h4.4" />
  </>
));

export const IconShield = createIcon("IconShield", "h-5 w-5", (
  <>
    <path d="M12 3 19.2 5.8v5.4c0 4.5-3 7.8-7.2 9.3-4.2-1.5-7.2-4.8-7.2-9.3V5.8L12 3z" />
    <path d="m9.2 11.6 2 2 3.6-4" />
  </>
));

export const IconDatabase = createIcon("IconDatabase", "h-5 w-5", (
  <>
    <ellipse cx="12" cy="5.8" rx="7.4" ry="2.6" />
    <path d="M4.6 5.8v12.4c0 1.4 3.3 2.6 7.4 2.6s7.4-1.2 7.4-2.6V5.8" />
    <path d="M4.6 12c0 1.4 3.3 2.6 7.4 2.6s7.4-1.2 7.4-2.6" />
  </>
));

export const IconInfo = createIcon("IconInfo", "h-5 w-5", (
  <>
    <circle cx="12" cy="12" r="8.3" />
    <path d="M12 11v5" />
    <path d="M12 8.1h.01" />
  </>
));

export function IconSpinner({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className={`animate-spin ${className ?? "h-5 w-5"}`}
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.55" />
    </svg>
  );
}
