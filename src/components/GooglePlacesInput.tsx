import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, X, Loader2, Check } from 'lucide-react';
import {
  fetchPlaceSuggestions,
  getPlaceCoordinates,
  geocodeAddress,
  PlaceSuggestion,
} from '../services/googleMapsService';

interface GooglePlacesInputProps {
  label: string;
  value: string;
  onChange: (address: string, lat?: number, lng?: number) => void;
  placeholder?: string;
  pinColor?: 'emerald' | 'rose' | 'amber' | 'blue';
  iconType?: 'pickup' | 'drop';
  required?: boolean;
  className?: string;
  suggestionGroup?: string;
  isActive?: boolean;
}

export const GooglePlacesInput: React.FC<GooglePlacesInputProps> = ({
  label,
  value,
  onChange,
  placeholder = 'Search address, landmark or area...',
  pinColor = 'emerald',
  iconType = 'pickup',
  required = false,
  className = '',
  suggestionGroup,
  isActive = true,
}) => {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRequestIdRef = useRef<number>(0);
  const userTypingRef = useRef(false);
  const lastUserValueRef = useRef<string | null>(null);

  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const skipSearchForValueRef = useRef<string | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileMenuStyle, setMobileMenuStyle] = useState<React.CSSProperties>({});
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);
  const mobilePreviousValueRef = useRef(value);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const updateViewportMode = () => setIsMobileViewport(mediaQuery.matches);
    updateViewportMode();
    mediaQuery.addEventListener?.('change', updateViewportMode);
    return () => mediaQuery.removeEventListener?.('change', updateViewportMode);
  }, []);

  const updateMobileMenuPosition = () => {
    if (!isMobileViewport || !inputRef.current) return;
    const inputRect = inputRef.current.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const top = Math.max(8, inputRect.bottom + 4);
    setMobileMenuStyle({
      top,
      left: Math.max(8, inputRect.left),
      width: Math.min(inputRect.width, window.innerWidth - Math.max(8, inputRect.left) - 8),
      maxHeight: Math.max(120, viewportHeight - top - 8),
    });
  };

  const openMobileSearch = () => {
    if (!isMobileViewport) {
      inputRef.current?.focus();
      return;
    }
    mobilePreviousValueRef.current = value;
    userTypingRef.current = false;
    activeRequestIdRef.current += 1;
    skipSearchForValueRef.current = null;
    setInputValue(value);
    setSuggestions([]);
    setIsOpen(false);
    setIsFocused(true);
    setMobileSearchOpen(true);
  };

  const closeMobileSearch = () => {
    userTypingRef.current = false;
    activeRequestIdRef.current += 1;
    skipSearchForValueRef.current = null;
    setInputValue(mobilePreviousValueRef.current);
    setSuggestions([]);
    setIsOpen(false);
    setIsLoading(false);
    setMobileSearchOpen(false);
    setIsFocused(false);
  };

  const clearInput = (refocusMobileInput = false) => {
    userTypingRef.current = false;
    activeRequestIdRef.current += 1;
    skipSearchForValueRef.current = null;
    lastUserValueRef.current = null;
    setInputValue('');
    setSuggestions([]);
    setIsOpen(false);
    setIsLoading(false);
    onChange('', undefined, undefined);
    if (refocusMobileInput) {
      window.requestAnimationFrame(() => mobileInputRef.current?.focus());
    } else {
      inputRef.current?.focus();
    }
  };

  useEffect(() => {
    if (!mobileSearchOpen) return;
    const frame = window.requestAnimationFrame(() => mobileInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [mobileSearchOpen]);

  useEffect(() => {
    if (!isMobileViewport || !isOpen) return;

    // Keep the focused field in the visible part of the modal when the native
    // keyboard opens, then position the menu against the updated input rect.
    inputRef.current?.scrollIntoView({ block: 'center', inline: 'nearest' });
    const frame = window.requestAnimationFrame(() => {
      updateMobileMenuPosition();
      window.requestAnimationFrame(updateMobileMenuPosition);
    });
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener('resize', updateMobileMenuPosition);
    visualViewport?.addEventListener('scroll', updateMobileMenuPosition);
    window.addEventListener('resize', updateMobileMenuPosition);
    window.addEventListener('scroll', updateMobileMenuPosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      visualViewport?.removeEventListener('resize', updateMobileMenuPosition);
      visualViewport?.removeEventListener('scroll', updateMobileMenuPosition);
      window.removeEventListener('resize', updateMobileMenuPosition);
      window.removeEventListener('scroll', updateMobileMenuPosition, true);
    };
  }, [isMobileViewport, isOpen]);

  useEffect(() => {
    if (value === lastUserValueRef.current) {
      lastUserValueRef.current = null;
      return;
    }
    userTypingRef.current = false;
    activeRequestIdRef.current += 1;
    if (!value) {
      setInputValue('');
      skipSearchForValueRef.current = null;
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }
    // Only update inputValue if different and not the one we just selected
    if (value !== inputValue && value !== skipSearchForValueRef.current) {
      setInputValue(value);
    }
  }, [value]);

  useEffect(() => {
    if (isActive) return;
    userTypingRef.current = false;
    activeRequestIdRef.current += 1;
    setSuggestions([]);
    setIsOpen(false);
    setIsFocused(false);
    setIsLoading(false);
  }, [isActive]);

  // Debounced places search: triggers whenever input text changes and wasn't just selected
  useEffect(() => {
    if (!userTypingRef.current || !isActive) {
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    // If the input value is empty or matches what the user just selected, do not search
    if (!inputValue || !inputValue.trim() || inputValue.trim().length < 1) {
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    if (inputValue === skipSearchForValueRef.current) {
      return;
    }

    const currentRequestId = ++activeRequestIdRef.current;
    setIsLoading(true);

    const timer = setTimeout(async () => {
      try {
        const results = await fetchPlaceSuggestions(inputValue);
        if (currentRequestId === activeRequestIdRef.current && inputValue !== skipSearchForValueRef.current) {
          setSuggestions(results);
          setSelectedIndex(-1);
          setIsOpen(results.length > 0);
        }
      } catch (err) {
        console.warn('Place search error:', err);
      } finally {
        if (currentRequestId === activeRequestIdRef.current) {
          setIsLoading(false);
        }
      }
    }, 160);

    return () => clearTimeout(timer);
  }, [inputValue, isActive]);

  useEffect(() => {
    if (!suggestionGroup) return;

    const closePeerSuggestions = (event: Event) => {
      const detail = (event as CustomEvent<{ group: string; source: HTMLDivElement | null }>).detail;
      if (detail?.group !== suggestionGroup || detail.source === wrapperRef.current) return;
      userTypingRef.current = false;
      activeRequestIdRef.current += 1;
      setSuggestions([]);
      setIsOpen(false);
      setIsFocused(false);
      setIsLoading(false);
    };

    window.addEventListener('google-places-focus', closePeerSuggestions);
    return () => window.removeEventListener('google-places-focus', closePeerSuggestions);
  }, [suggestionGroup]);

  // Close suggestions on outside click or touch
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node) &&
        !menuRef.current?.contains(event.target as Node) &&
        !mobileSearchRef.current?.contains(event.target as Node)
      ) {
        userTypingRef.current = false;
        activeRequestIdRef.current += 1;
        setSuggestions([]);
        setIsOpen(false);
        setIsFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const handleSelectSuggestion = async (suggestion: PlaceSuggestion) => {
    const selectedText = suggestion.description || suggestion.mainText;
    userTypingRef.current = false;
    activeRequestIdRef.current += 1;
    skipSearchForValueRef.current = selectedText;
    setInputValue(selectedText);
    setSuggestions([]);
    setIsOpen(false);
    setIsLoading(false);
    setMobileSearchOpen(false);
    setIsFocused(false);

    // If suggestion already contains lat/lng (e.g. Photon or Local DB or OSM)
    if (suggestion.lat !== undefined && suggestion.lng !== undefined) {
      onChange(selectedText, suggestion.lat, suggestion.lng);
      return;
    }

    setIsLoading(true);
    try {
      const coords = await getPlaceCoordinates(suggestion.placeId);
      if (coords && coords.lat !== undefined && coords.lng !== undefined) {
        onChange(selectedText, coords.lat, coords.lng);
      } else {
        onChange(selectedText);
      }
    } catch {
      onChange(selectedText);
    } finally {
      setIsLoading(false);
    }
  };

  // If user typed manually and blurred or pressed Enter without clicking dropdown:
  // Geocode in background to get coordinates for routing/distance, but NEVER overwrite the user's typed text!
  const handleManualCommit = async () => {
    userTypingRef.current = false;
    activeRequestIdRef.current += 1;
    setIsOpen(false);
    if (isMobileViewport) {
      setMobileSearchOpen(false);
      setIsFocused(false);
    }
    const text = inputValue;
    if (!text || !text.trim()) return;
    skipSearchForValueRef.current = text;
    try {
      const geocoded = await geocodeAddress(text);
      if (geocoded && geocoded.lat !== undefined && geocoded.lng !== undefined) {
        // Strictly keep what the user typed: only provide coordinates
        onChange(text, geocoded.lat, geocoded.lng);
      }
    } catch {
      // Keep manual text unchanged
    }
  };

  const dotColorClass =
    pinColor === 'emerald'
      ? 'bg-emerald-500'
      : pinColor === 'rose'
      ? 'bg-rose-500'
      : pinColor === 'amber'
      ? 'bg-amber-500'
      : 'bg-blue-600';

  const iconColorClass =
    pinColor === 'emerald'
      ? 'text-emerald-600'
      : pinColor === 'rose'
      ? 'text-rose-600'
      : pinColor === 'amber'
      ? 'text-amber-600'
      : 'text-blue-600';

  return (
    <div ref={wrapperRef} className={`relative space-y-1.5 ${isOpen ? 'max-[767px]:z-[100]' : ''} ${className}`}>
      {/* Label */}
      <div className="flex items-center justify-between">
        <label
          className="block text-slate-800 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
          onClick={() => inputRef.current?.focus()}
        >
          <span className={`w-2.5 h-2.5 rounded-full ${dotColorClass} ring-2 ring-white shadow-xs shrink-0`} />
          <span>{label}</span>
        </label>
      </div>

      {/* Input container */}
      <div
        onClick={openMobileSearch}
        className={`relative flex items-center bg-white border rounded-xl transition shadow-2xs cursor-text ${
          isFocused ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <div className="pl-3 pr-1.5 flex items-center justify-center shrink-0">
          <MapPin className={`w-4 h-4 ${iconColorClass}`} />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          readOnly={isMobileViewport}
          onChange={(e) => {
            const nextVal = e.target.value;
            skipSearchForValueRef.current = null;
            lastUserValueRef.current = nextVal;
            userTypingRef.current = true;
            if (suggestionGroup) {
              window.dispatchEvent(new CustomEvent('google-places-focus', {
                detail: { group: suggestionGroup, source: wrapperRef.current },
              }));
            }
            setIsFocused(true);
            setInputValue(nextVal);
            if (!isMobileViewport) onChange(nextVal);
          }}
          onBlur={() => {
            if (!isMobileViewport) handleManualCommit();
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (suggestions.length > 0) {
                setIsOpen(true);
                setSelectedIndex((prev) => (prev + 1) % suggestions.length);
              }
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              if (suggestions.length > 0) {
                setSelectedIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
              }
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (isOpen && selectedIndex >= 0 && selectedIndex < suggestions.length) {
                handleSelectSuggestion(suggestions[selectedIndex]);
              } else {
                handleManualCommit();
                setIsOpen(false);
              }
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setIsOpen(false);
            }
          }}
          onFocus={() => {
            if (isMobileViewport && !mobileSearchOpen) {
              openMobileSearch();
              return;
            }
            setIsFocused(true);
            if (suggestionGroup) {
              window.dispatchEvent(new CustomEvent('google-places-focus', {
                detail: { group: suggestionGroup, source: wrapperRef.current },
              }));
            }
          }}
          placeholder={placeholder}
          required={required}
          className="w-full bg-transparent py-2.5 pr-8 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />

        <div className="absolute right-2 flex items-center gap-1">
          {isLoading && (
            <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
          )}

          {inputValue && !isLoading && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                clearInput();
              }}
              onClick={() => clearInput()}
              aria-label={`Clear ${label}`}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Autocomplete Dropdown Menu - Taxi booking app style */}
      {!mobileSearchOpen && isOpen && suggestions.length > 0 && (() => {
        const suggestionMenu = (
        <div
          ref={menuRef}
          style={isMobileViewport ? mobileMenuStyle : undefined}
          className={isMobileViewport
            ? 'fixed bg-white rounded-xl shadow-2xl border border-slate-200 z-[1000] overflow-hidden divide-y divide-slate-100 animate-in fade-in slide-in-from-top-1 duration-150 overflow-y-auto overscroll-contain'
            : 'absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden divide-y divide-slate-100 animate-in fade-in slide-in-from-top-1 duration-150 max-h-72 overflow-y-auto'}
        >
          {/* Header with dismiss button */}
          <div className="px-3 py-1.5 bg-slate-50 flex items-center justify-between text-[11px] font-semibold text-slate-500 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3 h-3 text-amber-600" />
              <span>Location Suggestions ({suggestions.length})</span>
            </div>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setIsOpen(false);
              }}
              onClick={() => {
                setIsOpen(false);
              }}
              className="text-slate-400 hover:text-slate-700 text-[10px] px-1.5 py-0.5 rounded hover:bg-slate-200/60 transition cursor-pointer flex items-center gap-1"
            >
              <X className="w-2.5 h-2.5" />
              <span>Close</span>
            </button>
          </div>

          {suggestions.map((suggestion, idx) => (
            <button
              key={suggestion.placeId}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelectSuggestion(suggestion);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                handleSelectSuggestion(suggestion);
              }}
              onClick={() => handleSelectSuggestion(suggestion)}
              className={`w-full px-3.5 py-2.5 max-[767px]:min-h-12 text-left transition flex items-center gap-3 cursor-pointer text-xs group ${
                selectedIndex === idx
                  ? 'bg-amber-50 text-slate-950 font-semibold'
                  : 'hover:bg-slate-50 text-slate-800'
              }`}
            >
              <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0 group-hover:bg-amber-100 transition">
                <MapPin className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-600 transition" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="break-words text-xs font-semibold leading-snug text-slate-900">
                    {suggestion.mainText}
                  </p>
                  {suggestion.source && suggestion.source !== 'google' && (
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0 ${
                        suggestion.source === 'local'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {suggestion.source === 'local' ? 'Landmark' : 'Address'}
                    </span>
                  )}
                </div>
                {suggestion.secondaryText && (
                  <p className="mt-0.5 break-words text-[11px] leading-snug text-slate-500">
                    {suggestion.secondaryText}
                  </p>
                )}
              </div>
            </button>
          ))}

          {/* Option to use exact typed text */}
          {inputValue && inputValue.trim().length > 0 && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleManualCommit();
              }}
              onClick={handleManualCommit}
              className="w-full px-3.5 py-2 bg-slate-50/70 hover:bg-slate-100 text-left transition flex items-center gap-2 cursor-pointer text-[11px] text-slate-700 font-medium border-t border-slate-100"
            >
              <Check className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="min-w-0 break-words">Use typed location: <span className="font-semibold text-slate-900">"{inputValue}"</span></span>
            </button>
          )}
        </div>
        );
        return isMobileViewport ? createPortal(suggestionMenu, document.body) : suggestionMenu;
      })()}

      {mobileSearchOpen && createPortal(
        <div
          ref={mobileSearchRef}
          className="fixed inset-0 z-[1100] flex h-[100dvh] min-h-0 flex-col bg-white text-slate-900"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3">
            <button
              type="button"
              onClick={closeMobileSearch}
              className="min-h-11 min-w-11 rounded-lg px-2 text-left text-sm font-semibold text-slate-700 active:bg-slate-100"
            >
              Back
            </button>
            <h1 className="text-base font-semibold text-slate-900">{label}</h1>
          </header>

          <div className="shrink-0 px-4 py-3">
            <div className="relative">
              <input
                ref={mobileInputRef}
                type="text"
                value={inputValue}
                onChange={(e) => {
                  const nextVal = e.target.value;
                  skipSearchForValueRef.current = null;
                  userTypingRef.current = true;
                  setIsFocused(true);
                  setInputValue(nextVal);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isOpen && selectedIndex >= 0 && selectedIndex < suggestions.length) {
                    e.preventDefault();
                    handleSelectSuggestion(suggestions[selectedIndex]);
                  }
                }}
                placeholder={placeholder}
                className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 pr-12 text-base font-medium text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                autoFocus
              />
              {inputValue && (
                <button
                  type="button"
                  aria-label={`Clear ${label}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => clearInput(true)}
                  className="absolute right-2 top-1/2 flex min-h-10 min-w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 active:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-slate-100 pb-[env(safe-area-inset-bottom)]">
            {isLoading && (
              <p className="px-4 py-4 text-sm text-slate-500">Searching...</p>
            )}
            {!isLoading && suggestions.length > 0 && (
              <div className="divide-y divide-slate-100">
                {suggestions.map((suggestion, idx) => (
                  <button
                    key={suggestion.placeId}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelectSuggestion(suggestion)}
                    className={`flex min-h-14 w-full items-start px-4 py-3 text-left active:bg-slate-100 ${
                      selectedIndex === idx ? 'bg-slate-50' : 'bg-white'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-snug text-slate-900">{suggestion.mainText}</span>
                      {suggestion.secondaryText && (
                        <span className="mt-0.5 block text-xs leading-snug text-slate-500">{suggestion.secondaryText}</span>
                      )}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleManualCommit}
                  className="min-h-12 w-full bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-700 active:bg-slate-100"
                >
                  Use typed location: <span className="font-semibold text-slate-900">{inputValue}</span>
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
