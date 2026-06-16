# Express.js + TypeScript Backend Project

A professional, scalable backend skeleton built with Node.js, Express.js, and TypeScript.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (with auto-restart)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Check code quality
npm run lint
npm run lint:fix
```

## Features

✅ **Express.js** - Fast, minimal web framework  
✅ **TypeScript** - Type-safe JavaScript  
✅ **ESLint** - Code quality and style  
✅ **nodemon** - Auto-restart on file changes  
✅ **ts-node** - Run TypeScript directly  
✅ **Environment Variables** - Secure configuration  
✅ **Clean Architecture** - MVC pattern with routes, controllers, services, models  

## Folder Structure

- **routes/** - API endpoint definitions
- **controllers/** - HTTP request handlers
- **services/** - Business logic layer
- **middlewares/** - Request/response interceptors
- **models/** - Data structure definitions
- **config/** - Configuration files
- **utils/** - Helper functions and utilities

## Environment Setup

1. Copy `.env.example` to `.env`
2. Update values as needed:
   ```
   PORT=3000
   NODE_ENV=development
   ```

## Default Port

Server runs on `http://localhost:3000` by default.

Health check: `GET http://localhost:3000/health`

## Documentation

See [BACKEND_GUIDE.md](./BACKEND_GUIDE.md) for detailed explanation of:
- What each tool does (Node.js, Express, TypeScript, etc.)
- What goes in each folder
- How the architecture works
- Best practices and examples

## Scripts

- `npm run dev` - Development server with auto-reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Production server
- `npm run lint` - Check code quality
- `npm run lint:fix` - Fix code style automatically

---

**Ready to build! Start with uncommenting the user routes in src/index.ts and test the example implementation.**
