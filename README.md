# Hexagen - Infinite Hexagonal Grid

A web application featuring an infinite hexagonal grid that can be scrolled, zoomed, and panned. The backend serves hexagon images for specific coordinates, falling back to template images when specific images don't exist.

## Features

- **Infinite Hexagonal Grid**: Explore an endless hexagonal world
- **Interactive Controls**: 
  - Mouse wheel to zoom in/out
  - Click and drag to pan around
  - Zoom controls (+/- buttons)
  - Pan controls (arrow buttons)
  - Reset view button
- **Dynamic Image Loading**: Backend serves specific hexagon images or falls back to templates
- **Responsive Design**: Works on desktop and mobile devices

## Project Structure

```
hexagen/
├── backend/                 # Express.js backend
│   ├── src/
│   │   └── index.ts        # Main server file
│   ├── images/             # Specific hexagon images (x_y.png)
│   ├── templates/          # Template hexagon images
│   ├── package.json
│   └── tsconfig.json
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── HexagonalGrid.tsx
│   │   │   └── HexagonalGrid.css
│   │   ├── App.tsx
│   │   ├── App.css
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts
└── package.json            # Root package.json
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm

### Installation

1. Clone or download the project
2. Install dependencies for all parts:

```bash
npm run install:all
```

### Running the Application

1. Start both backend and frontend in development mode:

```bash
npm run dev
```

This will start:
- Backend server on http://localhost:3001
- Frontend development server on http://localhost:3000

2. Open your browser and navigate to http://localhost:3000

### Individual Commands

- **Backend only**: `npm run dev:backend`
- **Frontend only**: `npm run dev:frontend`
- **Build everything**: `npm run build`

## API Endpoints

### GET /api/hexagon/:x/:y

Returns a hexagon image for the specified coordinates.

- **Parameters**: 
  - `x`: X coordinate (integer)
  - `y`: Y coordinate (integer)
- **Response**: Image file (PNG/SVG)
- **Fallback**: If no specific image exists, returns a template image or generates an SVG

### GET /api/health

Health check endpoint.

- **Response**: `{ "status": "OK", "timestamp": "..." }`

## Adding Custom Hexagon Images

1. Place PNG images in `backend/images/` with the naming convention `{x}_{y}.png`
2. For example, `0_0.png` for coordinates (0,0), `5_-3.png` for coordinates (5,-3)
3. The backend will automatically serve these images when requested

## Customization

### Backend
- Modify `backend/src/index.ts` to change server behavior
- Add new endpoints or modify existing ones
- Customize the SVG generation in the `createSVGHexagon` function

### Frontend
- Modify `frontend/src/components/HexagonalGrid.tsx` for grid behavior
- Update `frontend/src/components/HexagonalGrid.css` for styling
- Adjust zoom limits, pan sensitivity, and other interactive features

## Technologies Used

- **Backend**: Node.js, Express.js, TypeScript
- **Frontend**: React, TypeScript, Vite
- **Styling**: CSS3 with modern features
- **Image Format**: SVG (generated) and PNG (static)

## Browser Support

- Modern browsers with ES2020 support
- Chrome, Firefox, Safari, Edge (latest versions)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Development Notes

- The hexagonal grid uses a coordinate system where each hexagon has integer coordinates
- Images are loaded dynamically as you explore the grid
- The grid is optimized to only render visible hexagons for performance
- Zoom range is limited between 10% and 500% for usability
