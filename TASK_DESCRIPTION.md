# Create a 3D floor plan modeling web application

- Use valtio as in memory database and reactive engine for rendering building elements
- Use a data structure that is easy to use for CRUD building elements. I want relationships maybe something like IFC (https://en.wikipedia.org/wiki/Industry_Foundation_Classes), but use any data structure that is best for selecting and moving walls with arrow keys etc. Exterior and interior walls should be created based on spaces maybe.
- Initialy should render a simple floor plan with a few rooms so we have something to work with. I want initial floor plan to be L shape.
- Should allow to select a wall and move it with keyboard keys to 2 directions
- When wall is moved, the walls attached to it should move with it as well
- You should implement just MVP where user can move exterior and interior walls.
- User should be able to select a wall and move it with keyboard keys down and it should create new wall and result should be something like this: @/public/handdrawing.png
- The overal idead of this application is that user should be able to create new rooms, walls etc just by moving and splitting other walls, so no need for manuall drawing.
- All extrior walls should move by 300mm and interior walls should move by 100mm.

Notes:

- Do not install any new dependencies
- If you need to run some scripts run it with 'bun'
