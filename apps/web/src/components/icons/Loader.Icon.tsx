import type { SVGProps } from 'react';

const IconLoader = (props: SVGProps<SVGSVGElement>) => (
  <svg width="1.1em" height="1.1em" viewBox="0 0 24 24" fill="none" stroke="CurrentColor" {...props}>
    <title>Loader</title>
    <path
      d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);
export default IconLoader;
