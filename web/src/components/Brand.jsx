const BrandIcon = ({ className = 'h-8 w-8' }) => (
  <img src="/icon.png" alt="" aria-hidden="true" className={`${className} object-contain`} />
)

export const Brand = ({ className = '', iconClassName = 'h-8 w-8', wordmarkClassName = '', showText = true }) => (
  <span className={`inline-flex items-center gap-2 ${className}`}>
    <BrandIcon className={iconClassName} />
    {showText && <span className={`font-display text-4xl font-bold tracking-tight text-jet-100 ${wordmarkClassName}`}>Smaran<span className="text-wordmark-ai">.ai</span></span>}
  </span>
)

export default BrandIcon
