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
      $location_ids = $this->entityTypeManager->getStorage('node')
        ->getQuery()
        ->condition('type', $type)
        ->condition('status', 1)
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
      $pins[] = [
        'icon' => $url->toString(),
        'location_id' => (int) $location->id(),
        'tags' => [$tag],
        'lat' => round($coordinates[0]['lat'], 5),
        'lng' => round($coordinates[0]['lng'], 5),
        'name' => $location->label(),
        'markup' => $this->renderer->render($view),
      ];
    }

    return $pins;
  }

}
