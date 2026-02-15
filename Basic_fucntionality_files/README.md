## HoloMed

Clinical-grade architecture in progress (MVC). Current focus: separating tracking, rendering, and processing.

HoloMed is a holographic medical visualization tool with real-time hand tracking control. Interact with 3D medical models using intuitive hand gestures.

### Prerequisites

- Python 3.10 or higher
- A webcam/camera for hand tracking
- Supported 3D model formats: STL, OBJ, PLY, VTK

### Installation

1. **Update pip** (recommended):
   ```bash
   python -m pip install -U pip
   ```

2. **Install HoloMed in editable mode**:
   ```bash
   python -m pip install -e .
   ```

   This will install all required dependencies:
   - `opencv-python` - Camera and video processing
   - `mediapipe` - Hand tracking
   - `pyvista` - 3D visualization
   - `numpy` - Numerical operations

### Running the Program

**Option 1: Using the installed command** (after installation):
```bash
holomed
```

**Option 2: Running directly with Python**:
```bash
python main.py
```

### Usage

1. **Start the application**: Run `holomed` or `python main.py`

2. **Select a 3D model**: A file picker dialog will appear. Choose a 3D model file (STL, OBJ, PLY, or VTK format). If no file is selected, a default brain model will be used.

3. **Interact with the model**:
   - **Rotate**: Pinch your thumb and index finger together and move your hand to rotate the model
   - **Zoom**: Use two hands - bring them closer together to zoom in, move them apart to zoom out
   - The camera feed will appear as a background in the visualization

4. **Exit**: Close the visualization window to exit the application

### Gesture Controls

- **One-handed pinch + move**: Rotate the 3D model
- **Two-handed distance change**: Zoom in/out

### Troubleshooting

- **Camera not working**: Ensure your webcam is connected and not being used by another application
- **Model not loading**: Check that your 3D model file is in a supported format (STL, OBJ, PLY, VTK)
- **Installation issues**: Make sure you have Python 3.10+ and try upgrading pip first
