// Allow the `jsx`/`global` props on <style> elements.
// The project uses the styled-jsx-style `<style jsx>` pattern (a leftover from
// Next.js) in a few components. Without styled-jsx's Babel transform this just
// renders a plain global <style> tag, which is fine at runtime — this only
// teaches TypeScript that the attribute is allowed.
import 'react';

declare module 'react' {
  interface StyleHTMLAttributes<T> {
    jsx?: boolean;
    global?: boolean;
  }
}
