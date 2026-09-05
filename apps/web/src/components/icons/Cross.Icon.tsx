import type { SVGProps } from 'react';

const IconCross = (props: SVGProps<SVGSVGElement>) => (
  <svg
    width="1.6em"
    height="1.6em"
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="currentColor"
    strokeWidth="2"
    {...props}
  >
    <title>Cross</title>
    <path d="M7.75732 7.75745L16.2426 16.2427"></path>
    <path d="M16.2426 7.75745L7.75732 16.2427"></path>
  </svg>
);

export default IconCross;
