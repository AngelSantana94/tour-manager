// types/cally.d.ts  ← crea este archivo en tu proyecto
declare namespace JSX {
  interface IntrinsicElements {
    'calendar-date': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      value?: string;
      min?: string;
      max?: string;
    };
    'calendar-month': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
  }
}