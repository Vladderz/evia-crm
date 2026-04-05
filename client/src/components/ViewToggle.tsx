interface Props {
  options: string[]
  activeIndex: number
  onChange: (index: number) => void
}

export default function ViewToggle({ options, activeIndex, onChange }: Props) {
  return (
    <div className="view-toggle" role="group">
      {options.map((label, i) => (
        <button
          key={label}
          className={`view-toggle-btn${activeIndex === i ? ' active' : ''}`}
          onClick={() => onChange(i)}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  )
}
