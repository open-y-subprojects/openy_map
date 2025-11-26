<?php

namespace Drupal\openy_map;

use Drupal\Core\Url;
use Drupal\openy_data_wrapper\DataWrapper;

/**
 * Class OpenyMapDataWrapper.
 *
 * Override getPins() method to provide location id.
 */
class OpenyMapDataWrapper extends DataWrapper {

  /**
   * {@inheritdoc}
   */
  public function getPins($type, $id = NULL) {
    if ($id) {
      $location_ids[] = $id;
    }
    else {
      $langcode = $this->languageManager->getCurrentLanguage()->getId();

      $location_ids = $this->entityTypeManager->getStorage('node')
        ->getQuery()
        ->condition('type', $type)
        ->condition('status', 1)
        ->condition('langcode', $langcode)
        ->accessCheck(FALSE)
        ->execute();
    }

    if (!$location_ids) {
      return [];
    }

    $storage = $this->entityTypeManager->getStorage('node');
    $builder = $this->entityTypeManager->getViewBuilder('node');
    $locations = $storage->loadMultiple($location_ids);

    // Get labels and icons for every bundle from OpenY Map config.
    $typeIcons = $this->configFactory->get('openy_map.settings')->get('type_icons');
    $typeLabels = $this->configFactory->get('openy_map.settings')->get('type_labels');
    $tag = $typeLabels[$type];
    $pins = [];
    foreach ($locations as $location) {
      $view = $builder->view($location, 'teaser');
      $coordinates = $location->get('field_location_coordinates')->getValue();
      if (!$coordinates) {
        continue;
      }

      $uri = !empty($typeIcons[$location->bundle()]) ? '/' . $typeIcons[$location->bundle()] :
        '/' . \Drupal::service('extension.list.module')->getPath('openy_map') . "/img/map_icon_green.png";
      $url = Url::fromUserInput($uri);

      // Drupal 11 compatibility: Sanitize render arrays before rendering.
      // Removes invalid render array keys (e.g., #code, #theme) that have
      // non-array values, which can come from webform and other modules.
      $this->sanitizeRenderArray($view);

      try {
        $markup = $this->renderer->render($view);
      }
      catch (\InvalidArgumentException $e) {
        // If rendering fails, skip this location and log the error.
        \Drupal::logger('openy_map')->warning('Failed to render location teaser for node %id: %error', [
          '%id' => $location->id(),
          '%error' => $e->getMessage(),
        ]);
        continue;
      }

      $pins[] = [
        'icon' => $url->toString(),
        'location_id' => (int) $location->id(),
        'tags' => [$tag],
        'lat' => round($coordinates[0]['lat'], 5),
        'lng' => round($coordinates[0]['lng'], 5),
        'name' => $location->label(),
        'markup' => $markup,
      ];
    }

    return $pins;
  }

  /**
   * Recursively sanitize render arrays to remove invalid keys.
   *
   * Drupal 11 requires all render array keys starting with '#' to have
   * array values, not strings or scalar values. This method removes invalid
   * render array keys (e.g., #code, #theme, #view_mode) that can come from
   * webform elements and other contrib modules not yet updated for Drupal 11.
   *
   * @param array &$element
   *   The render array to sanitize, passed by reference.
   */
  private function sanitizeRenderArray(array &$element) {
    if (!is_array($element)) {
      return;
    }

    // Remove all non-array-valued render keys (keys starting with #).
    // Drupal 11 requires these to be arrays, not strings or other types.
    foreach ($element as $key => $value) {
      if (strpos($key, '#') === 0 && !is_array($value)) {
        unset($element[$key]);
      }
    }

    // Recursively process children.
    foreach ($element as &$child) {
      if (is_array($child)) {
        $this->sanitizeRenderArray($child);
      }
    }
  }

}
