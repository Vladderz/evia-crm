interface Props {
  message?: string
}

export default function LoadingSpinner({ message = 'Loading...' }: Props) {
  return (
    <div className="loading-spinner-wrapper">
      <div className="loading-spinner" aria-hidden="true" />
      <p className="loading-spinner-text">{message}</p>
    </div>
  )
}
