# Example Queries for Apple HIG MCP

This document provides example queries you can use with the Apple HIG MCP in Claude Desktop. Each example shows the query, expected tool usage, and type of response you should receive.

## Design Guidelines Queries

### Basic Component Search
**Query:** "What are Apple's guidelines for designing buttons in iOS?"

**Expected Tool Usage:**
- `searchHIG` with query="button" and platform="ios"
- `getGuideline` for specific button guideline sections

**Response includes:**
- Button design principles
- Size and spacing recommendations
- Accessibility considerations
- Best practices for different button types

### Color System Query
**Query:** "Show me the iOS color system and how to use semantic colors"

**Expected Tool Usage:**
- `searchHIG` with query="color system" and platform="ios"
- `getGuideline` for color-related sections

**Response includes:**
- System color palette
- Semantic color usage
- Dark mode considerations
- Color accessibility guidelines

### Typography Guidelines
**Query:** "What fonts and text styles should I use for iOS apps?"

**Expected Tool Usage:**
- `searchHIG` with query="typography" and platform="ios"
- `getGuideline` for typography guidelines

**Response includes:**
- System fonts (SF Pro, SF Compact)
- Text style recommendations
- Dynamic Type support
- Readability best practices

## Platform-Specific Queries

### iOS-Specific Features
**Query:** "How should I implement navigation in an iOS app?"

**Expected Tool Usage:**
- `searchHIG` with query="navigation" and platform="ios"
- `getGuideline` for navigation patterns
- `browseSection` for navigation implementation examples

**Response includes:**
- Navigation patterns (tab bars, navigation bars)
- Navigation best practices
- SwiftUI/UIKit code examples

### macOS-Specific Design
**Query:** "What are the window management guidelines for macOS apps?"

**Expected Tool Usage:**
- `searchHIG` with query="window" and platform="macos"
- `getGuideline` for window management

**Response includes:**
- Window types and behaviors
- Toolbar design
- Window controls
- Multi-window support

### watchOS Constraints
**Query:** "What are the design constraints for Apple Watch apps?"

**Expected Tool Usage:**
- `searchHIG` with query="design" and platform="watchos"
- `browseSection` to watchOS section

**Response includes:**
- Screen size limitations
- Input methods
- Navigation patterns
- Performance considerations

## Code Example Requests

### SwiftUI Implementation
**Query:** "Show me SwiftUI code for a settings screen with toggles and navigation"

**Expected Tool Usage:**
- `getGuideline` with guidelineId="components/settings" and includeCode=true
- `getGuideline` with guidelineId="components/toggle" and includeCode=true
- `searchHIG` for settings design patterns

**Response includes:**
- Complete SwiftUI code example
- Best practices for settings screens
- Accessibility implementation

### UIKit Migration
**Query:** "How do I create a custom tab bar in UIKit following Apple's guidelines?"

**Expected Tool Usage:**
- `getGuideline` with guidelineId="components/tab-bar" and includeCode=true
- `searchHIG` with query="tab bar"

**Response includes:**
- UIKit implementation code
- Customization guidelines
- Design specifications

### AppKit for macOS
**Query:** "Give me AppKit code for a preferences window on macOS"

**Expected Tool Usage:**
- `getGuideline` with guidelineId="components/preferences" and includeCode=true
- `searchHIG` for macOS preferences

**Response includes:**
- AppKit window controller code
- Toolbar implementation
- Standard preferences layout

## Navigation and Exploration

### Browsing Guidelines
**Query:** "Show me all the available design guidelines for visionOS"

**Expected Tool Usage:**
- `browseSection` with section="design/human-interface-guidelines" and platform="visionos"

**Response includes:**
- Complete visionOS guidelines structure
- Available topics and sections
- Links to specific guidelines

### Deep Linking
**Query:** "Take me to the accessibility guidelines for iOS"

**Expected Tool Usage:**
- `browseSection` with section="accessibility" and platform="ios"

**Response includes:**
- Direct navigation to accessibility section
- Overview of accessibility features
- Implementation guidance

## Complex Multi-Tool Queries

### Complete Component Implementation
**Query:** "I need to implement a photo picker in my iOS app. Show me the guidelines and SwiftUI code"

**Expected Tool Usage:**
- `searchHIG` with query="photo picker"
- `getGuideline` for photo picker guidelines with includeCode=true
- `browseSection` for photo picker examples

**Response includes:**
- Design guidelines for photo selection
- Privacy considerations
- Complete SwiftUI implementation
- Best practices

### Cross-Platform Comparison
**Query:** "Compare the navigation patterns between iOS and macOS apps"

**Expected Tool Usage:**
- `searchHIG` with query="navigation" for both platforms
- `getGuideline` for platform-specific navigation
- `browseSection` to compare sections

**Response includes:**
- Side-by-side comparison
- Platform-specific considerations
- When to use which pattern
- Code examples for both

### Accessibility Audit
**Query:** "What accessibility features should I implement for buttons across all Apple platforms?"

**Expected Tool Usage:**
- `searchHIG` with query="accessibility button"
- Multiple `getGuideline` calls for each platform with includeCode=true
- `browseSection` for accessibility implementation

**Response includes:**
- VoiceOver support
- Dynamic Type
- Color contrast requirements
- Platform-specific considerations
- Implementation code

## Best Practices for Queries

1. **Be Specific:** Include the platform (iOS, macOS, etc.) for more targeted results
2. **Ask for Code:** Request code examples when you need implementation details
3. **Combine Requests:** Ask for both guidelines and code in a single query
4. **Use Navigation:** Ask to browse sections when exploring new topics
5. **Platform Comparison:** Request comparisons between platforms for cross-platform apps

## Troubleshooting Queries

If you're not getting expected results:
- Ensure the MCP is properly connected (check the puzzle piece icon)
- Try more specific search terms
- Specify the platform explicitly
- Break complex queries into smaller parts
- Check the Claude Desktop logs for any errors