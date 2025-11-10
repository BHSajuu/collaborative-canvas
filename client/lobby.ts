// Slugify function to make room names URL-safe
function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')      // Replace spaces with -
    .replace(/[^\w-]+/g, '')   // Remove all non-word chars
    .replace(/--+/g, '-');     // Replace multiple - with single -
}

// Main Form Handling
const form = document.getElementById('create-room-form');
const input = document.getElementById('room-name-input') as HTMLInputElement;

form?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (input?.value) {
    const roomName = slugify(input.value);
    // Redirect to the canvas page with the new room name
    window.location.href = `/index.html?room=${roomName}`;
  }
});

// Fetch and Display Active Rooms
const activeRoomList = document.getElementById('active-rooms-list');
const inactiveRoomList = document.getElementById('inactive-rooms-list');

/**
 * Helper to render a list of rooms to a UL element
 */
function renderRoomList(listElement: HTMLElement | null, rooms: string[], emptyMessage: string) {
  if (!listElement) return;

  // Clear the "Loading..." message or previous content
  listElement.innerHTML = '';

  if (rooms.length === 0) {
    listElement.innerHTML = `<li class="empty-list-message">${emptyMessage}</li>`;
    return;
  }

  // Populate the list with links
  rooms.forEach(room => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `/index.html?room=${room}`;
    a.textContent = room;
    li.appendChild(a);
    listElement.appendChild(li);
  });
}

async function fetchAndDisplayRooms() {
  if (!activeRoomList || !inactiveRoomList) return;

  try {
    // Fetch from the new endpoint
    const response = await fetch('/api/room-lists');
    if (!response.ok) {
      throw new Error('Failed to fetch rooms');
    }
    
    // Expect the new data structure
    const data: { activeRooms: string[], inactiveRecentRooms: string[] } = await response.json();

    // Render both lists
    renderRoomList(
      activeRoomList, 
      data.activeRooms, 
      "No active rooms. Create one!"
    );
    
    renderRoomList(
      inactiveRoomList, 
      data.inactiveRecentRooms, 
      "No recent rooms found."
    );

  } catch (err) {
    console.error(err);
    activeRoomList.innerHTML = '<li class="empty-list-message">Error loading rooms.</li>';
    inactiveRoomList.innerHTML = '<li class="empty-list-message">Error loading rooms.</li>';
  }
}

// Run on page load
fetchAndDisplayRooms();