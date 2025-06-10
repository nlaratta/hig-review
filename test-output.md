# Buttons

Learn how to design buttons that are easy to tap and clearly communicate their purpose.

# Buttons

Buttons initiate app-specific actions, have customizable backgrounds, and can include a title or an icon.

## Overview

The system provides a number of predefined button styles for most common use cases. You can also design a fully custom button.

## Best Practices

Create buttons that are easy to tap and clearly communicate their purpose.

SwiftUI Example struct ContentView: View { var body: some View { Button("Sign In") { // Handle sign in signIn() } .buttonStyle(.borderedProminent) } }

UIKit Example let button = UIButton(type: .system) button.setTitle("Sign In", for: .normal) button.addTarget(self, action: #selector(signInTapped), for: .touchUpInside)

### SwiftUI Example



### UIKit Example



## Specifications

Follow these guidelines to ensure your buttons meet accessibility standards.

## Platform Considerations

iOS On iOS, buttons can adapt their appearance based on their context and the containing view's style. // iOS-specific button configuration var config = UIButton.Configuration.filled() config.title = "Continue" config.baseBackgroundColor = .systemBlue config.cornerStyle = .medium let button = UIButton(configuration: config)

macOS On macOS, buttons follow the system appearance and support keyboard shortcuts. // macOS-specific button let button = NSButton(title: "Save", target: self, action: #selector(saveDocument)) button.keyEquivalent = "s" button.keyEquivalentModifierMask = [.command]

### iOS

On iOS, buttons can adapt their appearance based on their context and the containing view's style.

### macOS

On macOS, buttons follow the system appearance and support keyboard shortcuts.

**Minimum button sizes by platform**

| Platform | Minimum Size | Recommended Size |
| --- | --- | --- |
| iOS | 44x44 pt | 44x44 pt or larger |
| iPadOS | 44x44 pt | 44x44 pt or larger |
| macOS | 24x24 pt | 32x32 pt or larger |

