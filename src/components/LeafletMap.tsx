import React, { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default markers
// @ts-expect-error - Leaflet internal property
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export interface MapMarker {
  lat: number;
  lng: number;
  title: string;
  type: 'current' | 'log' | 'hazard' | 'zone';
  popup?: string;
}

export interface RestrictedZone {
  id: string;
  name: string;
  coordinates: Array<{ lat: number; lng: number }>;
  type: 'restricted' | 'hazardous';
}

interface LeafletMapProps {
  center: { lat: number; lng: number };
  zoom?: number;
  markers: MapMarker[];
  restrictedZones?: RestrictedZone[];
  onMapClick?: (lat: number, lng: number) => void;
  className?: string;
  height?: string;
}

export const LeafletMap: React.FC<LeafletMapProps> = ({
  center,
  zoom = 15,
  markers,
  restrictedZones = [],
  onMapClick,
  className = '',
  height = '400px'
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const zonesLayerRef = useRef<L.LayerGroup | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return;

    // Initialize map
    mapInstanceRef.current = L.map(mapRef.current).setView([center.lat, center.lng], zoom);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(mapInstanceRef.current);

    // Create layer groups
    markersLayerRef.current = L.layerGroup().addTo(mapInstanceRef.current);
    zonesLayerRef.current = L.layerGroup().addTo(mapInstanceRef.current);

    // Add click handler
    if (onMapClick) {
      mapInstanceRef.current.on('click', (e: L.LeafletMouseEvent) => {
        onMapClick(e.latlng.lat, e.latlng.lng);
      });
    }

    // Cleanup function
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [center.lat, center.lng, zoom, onMapClick]);

  // Update map center
  useEffect(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([center.lat, center.lng], zoom);
    }
  }, [center.lat, center.lng, zoom]);

  // Update markers
  useEffect(() => {
    if (!markersLayerRef.current) return;

    // Clear existing markers
    markersLayerRef.current.clearLayers();

    // Add new markers
    markers.forEach((marker) => {
      const icon = getMarkerIcon(marker.type);
      const leafletMarker = L.marker([marker.lat, marker.lng], { icon })
        .bindPopup(marker.popup || marker.title);

      markersLayerRef.current!.addLayer(leafletMarker);
    });
  }, [markers]);

  // Update restricted zones
  useEffect(() => {
    if (!zonesLayerRef.current) return;

    // Clear existing zones
    zonesLayerRef.current.clearLayers();

    // Add new zones
    restrictedZones.forEach((zone) => {
      const coordinates: [number, number][] = zone.coordinates.map(coord => [coord.lat, coord.lng]);
      
      const polygon = L.polygon(coordinates, {
        color: zone.type === 'restricted' ? '#ff0000' : '#ff8800',
        fillColor: zone.type === 'restricted' ? '#ff0000' : '#ff8800',
        fillOpacity: 0.2,
        weight: 2
      }).bindPopup(`${zone.name} (${zone.type})`);

      zonesLayerRef.current!.addLayer(polygon);
    });
  }, [restrictedZones]);

  return (
    <div 
      ref={mapRef} 
      className={`leaflet-map ${className}`}
      style={{ height, width: '100%' }}
    />
  );
};

// Helper function to get marker icons based on type
function getMarkerIcon(type: MapMarker['type']): L.Icon {
  const iconConfig = {
    iconSize: [25, 41] as [number, number],
    iconAnchor: [12, 41] as [number, number],
    popupAnchor: [1, -34] as [number, number],
    shadowSize: [41, 41] as [number, number]
  };

  switch (type) {
    case 'current':
      return L.icon({
        ...iconConfig,
        iconUrl: 'data:image/svg+xml;base64,' + btoa(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41">
            <path fill="#dc2626" stroke="#991b1b" stroke-width="1" 
                  d="M12.5 0C5.6 0 0 5.6 0 12.5c0 12.5 12.5 28.5 12.5 28.5s12.5-16 12.5-28.5C25 5.6 19.4 0 12.5 0z"/>
            <circle fill="white" cx="12.5" cy="12.5" r="6"/>
            <circle fill="#dc2626" cx="12.5" cy="12.5" r="3"/>
          </svg>
        `),
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png'
      });

    case 'log':
      return L.icon({
        ...iconConfig,
        iconUrl: 'data:image/svg+xml;base64,' + btoa(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41">
            <path fill="#2563eb" stroke="#1d4ed8" stroke-width="1" 
                  d="M12.5 0C5.6 0 0 5.6 0 12.5c0 12.5 12.5 28.5 12.5 28.5s12.5-16 12.5-28.5C25 5.6 19.4 0 12.5 0z"/>
            <circle fill="white" cx="12.5" cy="12.5" r="6"/>
          </svg>
        `),
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png'
      });

    case 'hazard':
      return L.icon({
        ...iconConfig,
        iconUrl: 'data:image/svg+xml;base64=' + btoa(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41">
            <path fill="#ea580c" stroke="#c2410c" stroke-width="1" 
                  d="M12.5 0C5.6 0 0 5.6 0 12.5c0 12.5 12.5 28.5 12.5 28.5s12.5-16 12.5-28.5C25 5.6 19.4 0 12.5 0z"/>
            <path fill="white" d="M12.5 6l2.5 6h-5l2.5-6z M10.5 15h4v3h-4v-3z"/>
          </svg>
        `),
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png'
      });

    case 'zone':
      return L.icon({
        ...iconConfig,
        iconUrl: 'data:image/svg+xml;base64=' + btoa(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41">
            <path fill="#7c3aed" stroke="#6d28d9" stroke-width="1" 
                  d="M12.5 0C5.6 0 0 5.6 0 12.5c0 12.5 12.5 28.5 12.5 28.5s12.5-16 12.5-28.5C25 5.6 19.4 0 12.5 0z"/>
            <rect fill="white" x="8" y="8" width="9" height="9"/>
          </svg>
        `),
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png'
      });

    default:
      return L.icon({
        ...iconConfig,
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png'
      });
  }
}