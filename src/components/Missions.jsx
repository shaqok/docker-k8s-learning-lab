import Rich from './Rich.jsx';

/** Guided mission checklist shown above each lab. */
export default function Missions({ title, items, done }) {
  return (
    <div className="missions">
      <h4>{title}</h4>
      {items.map((mi) => {
        const isDone = done.includes(mi.id);
        return (
          <div key={mi.id} className={'mission' + (isDone ? ' done' : '')}>
            <span className="mark">{isDone ? '✅' : '☐'}</span>{' '}
            <Rich tag="span" content={mi.text} />
          </div>
        );
      })}
    </div>
  );
}
