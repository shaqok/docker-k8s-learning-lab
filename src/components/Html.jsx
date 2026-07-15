/** Renders extracted rich-text content (trusted, app-bundled strings only). */
export default function Html({ html, className, tag: Tag = 'div', ...rest }) {
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} {...rest} />;
}
