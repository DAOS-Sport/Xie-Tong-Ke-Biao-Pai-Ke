import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";

interface CoachAutocompleteProps {
  onSelect: (coachName: string) => void;
}

export default function CoachAutocomplete({ onSelect }: CoachAutocompleteProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: coaches } = useQuery<string[]>({
    queryKey: ['/api/coaches'],
  });

  const filteredCoaches = coaches?.filter(coach => 
    coach.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSelect('');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onSelect]);

  if (filteredCoaches.length === 0) {
    return null;
  }

  return (
    <div className="absolute top-full left-0 right-0 bg-card border border-border rounded-md shadow-lg z-40 mt-1">
      <div className="py-1" data-testid="autocomplete-dropdown">
        {filteredCoaches.slice(0, 5).map((coach, index) => (
          <div
            key={index}
            className="px-3 py-2 text-sm hover:bg-accent cursor-pointer"
            onClick={() => onSelect(coach)}
            data-testid={`coach-option-${index}`}
          >
            {coach}
          </div>
        ))}
      </div>
    </div>
  );
}
