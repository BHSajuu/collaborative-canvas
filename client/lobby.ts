// --- Slugify function to make room names URL-safe ---
function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')      // Replace spaces with -
    .replace(/[^\w-]+/g, '')   // Remove all non-word chars
    .replace(/--+/g, '-');     // Replace multiple - with single -
}

// --- Main Form Handling ---
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

// --- Fetch and Display Active Rooms ---
const roomList = document.getElementById('active-rooms-list');

async function fetchAndDisplayRooms() {
  if (!roomList) return;

  try {
    const response = await fetch('/api/rooms');
    if (!response.ok) {
      throw new Error('Failed to fetch rooms');
    }
    const rooms: string[] = await response.json();

    // Clear the "Loading..." message
    roomList.innerHTML = '';

    if (rooms.length === 0) {
      roomList.innerHTML = '<li>No active rooms. Create one!</li>';
      return;
    }

    // Populate the list with links
    rooms.forEach(room => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `/index.html?room=${room}`;
      a.textContent = room;
      li.appendChild(a);
      roomList.appendChild(li);
    });

  } catch (err) {
    console.error(err);
    roomList.innerHTML = '<li>Error loading rooms.</li>';
  }
}

// --- Run on page load ---
fetchAndDisplayRooms();